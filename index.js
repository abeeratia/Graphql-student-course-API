import express from "express";
import { ApolloServer, gql } from "apollo-server-express";
import mongoose from "mongoose";
import Course from "./models/course.js";
import Student from "./models/student.js";

const typeDefs = gql`
  type Student {
    id: ID!
    name: String!
    email: String!
    age: Int!
    major: String
    courses: [Course]
  }

  type Course {
    id: ID!
    title: String!
    code: String!
    credits: Int!
    instructor: String!
    students: [Student]
  }

  input StudentInput {
    name: String!
    email: String!
    age: Int!
    major: String
  }

  input CourseInput {
    title: String!
    code: String!
    credits: Int!
    instructor: String!
  }

  type Query {
    getAllStudents: [Student!]!
    getStudent(id: ID!): Student
    getAllCourses: [Course!]!
    getCourse(id: ID!): Course
    searchStudentsByMajor(major: String!): [Student!]!
  }

  type Mutation {
    addStudent(input: StudentInput): Student!
    updateStudent(id: ID!, input: StudentInput): Student!
    deleteStudent(id: ID!): Boolean!
    addCourse(input: CourseInput): Course!
    updateCourse(id: ID!, input: CourseInput): Course!
    deleteCourse(id: ID!): Boolean!
    enrollStudentInCourse(studentId: ID!, courseId: ID!): Student!
  }
`;

const resolvers = {
  Query: {
    getAllStudents: async () => await Student.find(),
    getStudent: async (_, { id }) => await Student.findById(id),
    getAllCourses: async () => await Course.find(),
    getCourse: async (_, { id }) => await Course.findById(id),
    searchStudentsByMajor: async (_, { major }) =>
      await Student.find({ major }),
  },

  Mutation: {
    addStudent: async (_, { input }) => {
      const newStudent = new Student(input);
      await newStudent.save();
      return newStudent;
    },
    updateStudent: async (_, { id, input }) =>
      await Student.findByIdAndUpdate(id, input, { new: true }),
    deleteStudent: async (_, { id }) => !!(await Student.findByIdAndDelete(id)),

    addCourse: async (_, { input }) => {
      const newCourse = new Course(input);
      await newCourse.save();
      return newCourse;
    },
    updateCourse: async (_, { id, input }) =>
      await Course.findByIdAndUpdate(id, input, { new: true }),
    deleteCourse: async (_, { id }) => !!(await Course.findByIdAndDelete(id)),

    enrollStudentInCourse: async (_, { studentId, courseId }) => {
      const foundStudent = await Student.findById(studentId);
      const foundCourse = await Course.findById(courseId);

      if (!foundStudent || !foundCourse) throw new Error("Invalid IDs");

      if (!foundStudent.courses.includes(courseId))
        foundStudent.courses.push(courseId);

      if (!foundCourse.students.includes(studentId))
        foundCourse.students.push(studentId);

      await foundStudent.save();
      await foundCourse.save();

      return foundStudent.populate("courses");
    },
  },

  Student: {
    courses: async (parent) =>
      await Course.find({ _id: { $in: parent.courses } }),
  },
  Course: {
    students: async (parent) =>
      await Student.find({ _id: { $in: parent.students } }),
  },
};

const startServer = async () => {
  await mongoose.connect("mongodb://127.0.0.1:27017/graphql-lab", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log("✅ MongoDB Connected");

  const app = express();
  const server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
  server.applyMiddleware({ app, path: "/graphql" });
  app.listen(4000, () =>
    console.log("🚀 Server ready at http://localhost:4000/graphql")
  );
};

startServer();
